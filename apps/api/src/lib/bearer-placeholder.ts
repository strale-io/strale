/**
 * Unexpanded placeholder Authorization headers are read as "no key".
 *
 * Directory listings and integration configs (MCP clients, n8n, Postman,
 * copy-pasted curl) ship `Authorization: Bearer ${STRALE_API_KEY}` by
 * default. When the user has no key, the template is sent as written, and
 * every anonymous free-tier or x402 caller was refused with invalid_api_key
 * before the route could serve or quote them (PR #831's report).
 *
 * The detector is strict: only the exact template shapes below match, and a
 * value carrying a real credential prefix (sk_live_, sto_at_) never does, so
 * a mistyped real key is still refused as before.
 */
import { log } from "./log.js";

const REAL_PREFIXES = ["sk_live_", "sto_at_"];

// Each is a whole-value match: ${NAME}, $NAME, {{NAME}}, %NAME%, <anything>.
const TEMPLATE_SHAPES = [
  /^\$\{\s*[A-Za-z_][A-Za-z0-9_.:-]*\s*\}$/,
  /^\$[A-Za-z_][A-Za-z0-9_]*$/,
  /^\{\{\s*[A-Za-z_$][A-Za-z0-9_.$-]*\s*\}\}$/,
  /^%[A-Za-z_][A-Za-z0-9_]*%$/,
  /^<[^<>\s][^<>]{0,62}>$/,
];

// Literal stand-ins, compared lowercased with "-" read as "_".
const LITERALS = new Set([
  "undefined",
  "null",
  "api_key",
  "apikey",
  "your_api_key",
  "your_api_key_here",
  "your_key",
  "your_key_here",
  "your_token",
  "your_strale_api_key",
  "your_strale_key",
  "strale_api_key",
  "insert_api_key_here",
]);

export function isPlaceholderBearer(token: string): boolean {
  const value = token.trim();
  if (value === "") return true;
  if (REAL_PREFIXES.some((p) => value.startsWith(p))) return false;
  if (TEMPLATE_SHAPES.some((re) => re.test(value))) return true;
  return LITERALS.has(value.toLowerCase().replaceAll("-", "_"));
}

let placeholderCount = 0;

/** How many placeholder headers this process has read as "no key". */
export function placeholderBearerCount(): number {
  return placeholderCount;
}

/**
 * The bearer token from an Authorization header value, or null when the header
 * is absent, not a Bearer, or a placeholder: all three are "no key" to the
 * caller. Placeholders are counted, and sampled to the log by route, never
 * with the value.
 */
export function readBearer(header: string | null | undefined, route: string): string | null {
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  if (!isPlaceholderBearer(token)) return token;
  placeholderCount++;
  // First one, then every 100th: a client looping a placeholder must not cost
  // one log line per request (the /v1/do IP limit answers after this read).
  if (placeholderCount === 1 || placeholderCount % 100 === 0) {
    log.info({ label: "auth-placeholder-bearer", route, count: placeholderCount }, "auth-placeholder-bearer");
  }
  return null;
}
