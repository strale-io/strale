/**
 * robots.txt, honoured before Strale fetches a third-party page
 * (DEC-20261023-A: the fetch path "stops at an explicit block: … robots.txt
 * `Disallow` for the path").
 *
 * Follows RFC 9309:
 *
 *   - Groups (§2.1): consecutive `user-agent` lines share the rules that
 *     follow them. The group naming {@link STRALE_ROBOTS_TOKEN} applies if
 *     there is one; otherwise the `*` group; otherwise nothing is disallowed.
 *     Several groups for the same agent are merged.
 *   - Matching (§2.2.2): the longest matching `allow`/`disallow` pattern wins,
 *     and `allow` wins a tie. `*` matches any sequence and a trailing `$`
 *     anchors the end. `/robots.txt` itself is always allowed. Both sides are
 *     percent-decoded before comparing, so `%3A%2F%2F` matches `://` as the
 *     RFC's own example requires. Matching is a linear-time wildcard walk,
 *     NOT a RegExp: robots.txt is written by whoever owns the site, and a
 *     pattern such as `/*a*a*a*b` compiled to `.*` backtracks exponentially —
 *     measured at 17 s on a 500-character path, blocking the event loop.
 *   - Access results (§2.3.1): 2xx is parsed; any other 4xx means "no
 *     robots.txt", so everything is allowed; 5xx means unreachable, which the
 *     RFC says MUST be treated as complete disallow. 429 is grouped with 5xx
 *     (as Google does): a site rate-limiting its robots.txt is asking crawlers
 *     to stay away, not saying it has no rules.
 *   - Caching (§2.4): at most 24 hours. Used here: one hour for a parsed file
 *     or a 4xx, five minutes for an unreachable one, so a brief outage of the
 *     site does not refuse it for an hour afterwards. Concurrent checks for one
 *     origin share a single request.
 *
 * One deliberate departure: a TRANSPORT failure (DNS, refused connection,
 * timeout) allows the fetch rather than refusing it. The page fetch that
 * follows goes to the same host and fails with the precise error the caller
 * needs ("domain does not resolve"), and a slow robots.txt on a healthy site
 * would otherwise refuse a page nobody asked us to stay away from. This is
 * recorded so it is a decision, not an accident; the RFC's "unreachable"
 * clause is applied to every case where the server answered. The allow is
 * cached for five minutes, so a robots.txt that hangs costs its timeout once
 * per origin per five minutes, not on every call.
 *
 * Redirects: a fetch that ends on a different URL is checked again against
 * the final URL's robots.txt (`assertRedirectAllowed`), and the page is
 * refused. This runs AFTER the transport has followed the redirect — safeFetch
 * and Browserless both follow it before Strale sees the final URL — so the
 * disallowed page has been requested once; what the check guarantees is that
 * its content is never used or returned. Checking every hop beforehand would
 * need a per-hop hook in safeFetch's redirect loop, and is not possible on the
 * Browserless route.
 *
 * Not a crawler: Strale fetches one page per call, so Crawl-delay is not
 * consulted.
 */

import { discardBody, safeFetch } from "./safe-fetch.js";
import { readRobotsTxt } from "./resource-limits.js";
import {
  STRALE_ROBOTS_TOKEN,
  STRALE_USER_AGENT,
  siteAccessRefusal,
} from "./site-access.js";

// ─── Parsing ────────────────────────────────────────────────────────────────

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}

export interface RobotsGroup {
  /** Lower-cased product tokens from the group's `user-agent` lines. */
  agents: string[];
  rules: RobotsRule[];
}

/** Parse a robots.txt body into groups. Unknown lines are ignored (§2.2.4). */
export function parseRobotsTxt(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  // A user-agent line directly after another one joins the same group; one
  // after a rule line starts a new group (§2.1).
  let lastWasAgent = false;

  for (const rawLine of text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    // Only a rule line ends a run of user-agent lines. Sitemap, Crawl-delay
    // and unknown records are not group members (§2.2.4), so a `Sitemap:`
    // between two user-agent lines must not split them into two groups.
    if (key !== "allow" && key !== "disallow") continue;
    lastWasAgent = false;
    if (!current) continue; // rules before any user-agent line belong to no group
    // An empty `disallow:` is "nothing disallowed" — it adds no rule.
    if (value) current.rules.push({ allow: key === "allow", pattern: value });
  }
  return groups;
}

/**
 * Does a `user-agent` value name this crawler? Case-insensitive, on the
 * product token alone: `StraleBot`, `stralebot` and `StraleBot/1.0` all match.
 */
function agentMatches(agentValue: string, token: string): boolean {
  const product = agentValue.split("/")[0].trim();
  return product === token.toLowerCase();
}

/** The rules that apply to `token`: its own groups merged, else `*`, else none. */
export function rulesFor(groups: RobotsGroup[], token: string): RobotsRule[] {
  const own = groups.filter((g) => g.agents.some((a) => agentMatches(a, token)));
  if (own.length > 0) return own.flatMap((g) => g.rules);
  return groups.filter((g) => g.agents.includes("*")).flatMap((g) => g.rules);
}

/**
 * Percent-decode for comparison (§2.2.2), so `/caf%C3%A9`, `/café`,
 * `https%3A%2F%2F` and `https://` compare equal. A malformed escape is left
 * as written rather than refusing the whole file.
 */
function decodeForMatch(s: string): string {
  // Per run of escapes, not all-or-nothing: one invalid sequence must not
  // leave the rest encoded, or `/%73earch?q=%E9` would slip past
  // `Disallow: /search` (independent review, 2026-10-24). Within a run that
  // is not valid UTF-8, ASCII escapes still decode and the rest stay as
  // upper-cased escapes.
  return s.replace(/(?:%[0-9a-f]{2})+/gi, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run.replace(/%([0-9a-f]{2})/gi, (m, hex: string) => {
        const code = parseInt(hex, 16);
        return code < 0x80 ? String.fromCharCode(code) : m.toUpperCase();
      });
    }
  });
}

interface CompiledPattern {
  /** Literal pieces between `*`s, each percent-decoded. */
  segments: string[];
  /** Pattern ended in `$`: the last segment must end the path. */
  anchored: boolean;
  /** Decoded length, the "longest match" measure. */
  length: number;
}

function compilePattern(pattern: string): CompiledPattern {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const segments = body.split("*").map(decodeForMatch);
  return { segments, anchored, length: segments.join("*").length + (anchored ? 1 : 0) };
}

/**
 * Linear-time wildcard match. The first segment is a prefix; each later
 * segment is found at its leftmost position after the previous one (greedy
 * leftmost is exact for `*`-only globs: an earlier match never leaves less
 * room for what follows); an anchored last segment must sit at the very end.
 */
function matches(p: CompiledPattern, target: string): boolean {
  const { segments, anchored } = p;
  if (!target.startsWith(segments[0])) return false;
  if (segments.length === 1) return anchored ? target.length === segments[0].length : true;
  let pos = segments[0].length;
  for (let i = 1; i < segments.length - 1; i++) {
    const at = target.indexOf(segments[i], pos);
    if (at === -1) return false;
    pos = at + segments[i].length;
  }
  const last = segments[segments.length - 1];
  if (anchored) return target.length - last.length >= pos && target.endsWith(last);
  return target.indexOf(last, pos) !== -1;
}

/**
 * Is `pathAndQuery` allowed by `rules`? Longest matching pattern wins; `allow`
 * wins a tie; no matching rule means allowed.
 */
export function isPathAllowed(rules: RobotsRule[], pathAndQuery: string): boolean {
  return isAllowedCompiled(compileRules(rules), pathAndQuery);
}

interface CompiledRule {
  allow: boolean;
  pattern: CompiledPattern;
}

function compileRules(rules: RobotsRule[]): CompiledRule[] {
  return rules.map((r) => ({ allow: r.allow, pattern: compilePattern(r.pattern) }));
}

function isAllowedCompiled(rules: CompiledRule[], pathAndQuery: string): boolean {
  if (pathAndQuery === "/robots.txt") return true;
  const target = decodeForMatch(pathAndQuery);
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of rules) {
    const compiled = rule.pattern;
    if (!matches(compiled, target)) continue;
    if (
      !best ||
      compiled.length > best.length ||
      (compiled.length === best.length && rule.allow && !best.allow)
    ) {
      best = { allow: rule.allow, length: compiled.length };
    }
  }
  return best ? best.allow : true;
}

// ─── Fetching and caching ───────────────────────────────────────────────────

/** What one origin's robots.txt says, as far as this module needs. */
type RobotsVerdict =
  | { kind: "rules"; rules: CompiledRule[] }
  | { kind: "allow_all" }
  | { kind: "transport_failed" }
  | { kind: "unreachable"; status: number };

interface CacheEntry {
  verdict: RobotsVerdict;
  expiresAt: number;
}

const OK_TTL_MS = 60 * 60 * 1000;
const UNREACHABLE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1000;
const ROBOTS_TIMEOUT_MS = 5000;
/** See assertRobotsAllowed: bounds rules × path-length matching work. */
const MAX_MATCHED_PATH_CHARS = 4096;
/** RFC 9309 §2.3.1.2: follow at least five consecutive redirects. */
const ROBOTS_MAX_REDIRECTS = 5;

const cache = new Map<string, CacheEntry>();
/** One request per origin at a time; concurrent callers await the same one. */
const inFlight = new Map<string, Promise<RobotsVerdict>>();

/** Reset the cache. Test seam only (`__…ForTests` convention). */
export function __resetRobotsCacheForTests(): void {
  cache.clear();
  inFlight.clear();
}

function remember(origin: string, verdict: RobotsVerdict): RobotsVerdict {
  const ttl =
    verdict.kind === "unreachable" || verdict.kind === "transport_failed" ? UNREACHABLE_TTL_MS : OK_TTL_MS;
  cache.delete(origin);
  while (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(origin, { verdict, expiresAt: Date.now() + ttl });
  return verdict;
}

function loadVerdict(origin: string): Promise<RobotsVerdict> {
  const hit = cache.get(origin);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.verdict);
  const pending = inFlight.get(origin);
  if (pending) return pending;
  const request = fetchVerdict(origin).finally(() => inFlight.delete(origin));
  inFlight.set(origin, request);
  return request;
}

async function fetchVerdict(origin: string): Promise<RobotsVerdict> {
  let response: Response;
  try {
    response = await safeFetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": STRALE_USER_AGENT, Accept: "text/plain,*/*;q=0.5" },
      maxRedirects: ROBOTS_MAX_REDIRECTS,
      timeoutMs: ROBOTS_TIMEOUT_MS,
    });
  } catch {
    // Transport failure: see the module header. Allowed, and cached briefly.
    return remember(origin, { kind: "transport_failed" });
  }

  if (response.ok) {
    let text: string;
    try {
      text = await readRobotsTxt(response);
    } catch {
      // Headers arrived, then the body stalled or broke: the same transport
      // failure as above, and cached the same way, so a robots.txt that hangs
      // mid-body does not cost its timeout on every call.
      return remember(origin, { kind: "transport_failed" });
    }
    return remember(origin, {
      kind: "rules",
      rules: compileRules(rulesFor(parseRobotsTxt(text), STRALE_ROBOTS_TOKEN)),
    });
  }
  await discardBody(response, `robots.txt HTTP ${response.status}`);
  if (response.status >= 500 || response.status === 429) {
    return remember(origin, { kind: "unreachable", status: response.status });
  }
  return remember(origin, { kind: "allow_all" });
}

/**
 * Throw a site-access refusal if the target's robots.txt disallows this URL
 * for Strale, or cannot be read because the server answered with an error.
 *
 * Call before the first byte of the page is requested, on every route.
 * A malformed URL is left for the caller's own validation to report.
 */
export async function assertRobotsAllowed(targetUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;

  const verdict = await loadVerdict(parsed.origin);
  if (verdict.kind === "allow_all" || verdict.kind === "transport_failed") return;
  if (verdict.kind === "unreachable") {
    throw siteAccessRefusal(targetUrl, { kind: "robots_unavailable", status: verdict.status });
  }
  const pathAndQuery = `${parsed.pathname}${parsed.search}`;
  // Matching is linear per rule, so its cost is rules × path length. A site
  // owner controls the rules (up to 500 KiB) and, on a customer-directed
  // fetch, can control the URL too; capping the URL bounds the product.
  // Servers commonly refuse request lines past 8 KiB (HTTP 414) anyway.
  if (pathAndQuery.length > MAX_MATCHED_PATH_CHARS) {
    throw new Error(
      `'url' must be ${MAX_MATCHED_PATH_CHARS} characters or less in its path and query to be checked against robots.txt.`,
    );
  }
  if (!isAllowedCompiled(verdict.rules, pathAndQuery)) {
    throw siteAccessRefusal(targetUrl, { kind: "robots_disallow" });
  }
}

/**
 * Re-check robots.txt when a fetch ended somewhere other than where it was
 * asked to go. Redirects are followed by the transport (safeFetch, or the
 * browser), so the first check only covered the URL the caller named.
 */
export async function assertRedirectAllowed(requestedUrl: string, finalUrl: string | null | undefined): Promise<void> {
  if (!finalUrl || finalUrl === requestedUrl) return;
  await assertRobotsAllowed(finalUrl);
}
