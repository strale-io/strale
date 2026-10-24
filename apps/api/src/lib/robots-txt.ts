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
 *     anchors the end. `/robots.txt` itself is always allowed.
 *   - Access results (§2.3.1): 2xx is parsed; any other 4xx means "no
 *     robots.txt", so everything is allowed; 5xx means unreachable, which the
 *     RFC says MUST be treated as complete disallow. 429 is grouped with 5xx
 *     (as Google does): a site rate-limiting its robots.txt is asking crawlers
 *     to stay away, not saying it has no rules.
 *   - Caching (§2.4): at most 24 hours. Used here: one hour for a parsed file
 *     or a 4xx, five minutes for an unreachable one, so a brief outage of the
 *     site does not refuse it for an hour afterwards.
 *
 * One deliberate departure: a TRANSPORT failure (DNS, refused connection,
 * timeout) allows the fetch rather than refusing it. The page fetch that
 * follows goes to the same host and fails with the precise error the caller
 * needs ("domain does not resolve"), and a slow robots.txt on a healthy site
 * would otherwise refuse a page nobody asked us to stay away from. This is
 * recorded so it is a decision, not an accident; the RFC's "unreachable"
 * clause is applied to every case where the server answered.
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

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
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
    lastWasAgent = false;
    if (!current) continue; // rules before any user-agent line belong to no group
    if (key === "allow" || key === "disallow") {
      // An empty `disallow:` is "nothing disallowed" — it adds no rule.
      if (value) current.rules.push({ allow: key === "allow", pattern: value });
    }
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
 * Percent-encode the characters a pattern may legally contain unencoded, so a
 * pattern `/café` and a request path `/caf%C3%A9` compare equal (§2.2.2).
 * Already-encoded octets are upper-cased, not double-encoded.
 */
function normalizeForMatch(s: string): string {
  return s
    .replace(/%[0-9a-f]{2}/gi, (m) => m.toUpperCase())
    .replace(/[^\x21-\x7e]/g, (c) => encodeURIComponent(c));
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = normalizeForMatch(body)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`);
}

/**
 * Is `pathAndQuery` allowed by `rules`? Longest matching pattern wins; `allow`
 * wins a tie; no matching rule means allowed.
 */
export function isPathAllowed(rules: RobotsRule[], pathAndQuery: string): boolean {
  if (pathAndQuery === "/robots.txt") return true;
  const target = normalizeForMatch(pathAndQuery);
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!patternToRegExp(rule.pattern).test(target)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

// ─── Fetching and caching ───────────────────────────────────────────────────

/** What one origin's robots.txt says, as far as this module needs. */
type RobotsVerdict =
  | { kind: "rules"; rules: RobotsRule[] }
  | { kind: "allow_all" }
  | { kind: "unreachable"; status: number };

interface CacheEntry {
  verdict: RobotsVerdict;
  expiresAt: number;
}

const OK_TTL_MS = 60 * 60 * 1000;
const UNREACHABLE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 1000;
const ROBOTS_TIMEOUT_MS = 5000;
/** RFC 9309 §2.3.1.2: follow at least five consecutive redirects. */
const ROBOTS_MAX_REDIRECTS = 5;

const cache = new Map<string, CacheEntry>();

/** Reset the cache. Test seam only (`__…ForTests` convention). */
export function __resetRobotsCacheForTests(): void {
  cache.clear();
}

function remember(origin: string, verdict: RobotsVerdict): RobotsVerdict {
  const ttl = verdict.kind === "unreachable" ? UNREACHABLE_TTL_MS : OK_TTL_MS;
  cache.delete(origin);
  while (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  cache.set(origin, { verdict, expiresAt: Date.now() + ttl });
  return verdict;
}

async function loadVerdict(origin: string): Promise<RobotsVerdict | null> {
  const hit = cache.get(origin);
  if (hit && hit.expiresAt > Date.now()) return hit.verdict;

  let response: Response;
  try {
    response = await safeFetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": STRALE_USER_AGENT, Accept: "text/plain,*/*;q=0.5" },
      maxRedirects: ROBOTS_MAX_REDIRECTS,
      timeoutMs: ROBOTS_TIMEOUT_MS,
    });
  } catch {
    // Transport failure: see the module header. Not cached, so the next call
    // asks again rather than inheriting a guess.
    return null;
  }

  if (response.ok) {
    const text = await readRobotsTxt(response);
    return remember(origin, { kind: "rules", rules: rulesFor(parseRobotsTxt(text), STRALE_ROBOTS_TOKEN) });
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
  if (!verdict || verdict.kind === "allow_all") return;
  if (verdict.kind === "unreachable") {
    throw siteAccessRefusal(targetUrl, { kind: "robots_unavailable", status: verdict.status });
  }
  if (!isPathAllowed(verdict.rules, `${parsed.pathname}${parsed.search}`)) {
    throw siteAccessRefusal(targetUrl, { kind: "robots_disallow" });
  }
}
