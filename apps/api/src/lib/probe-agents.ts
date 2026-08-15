/**
 * Telling monitoring infrastructure apart from potential customers.
 *
 * Why this exists: on 2026-08-15 the dashboard reported "183 AI agents found us
 * this week" and a funnel showing 92% of them leaving before viewing the
 * catalogue. Both numbers were real and both conclusions were wrong. Inspecting
 * the user agents showed the traffic was almost entirely health checkers,
 * registry indexers and scoring engines — `glimind-probe`, `mcpbeat`,
 * `yellowmcp-health`, `smithery-probe`, `x402-observatory`, `aisec-registry-probe`.
 * One of them initialized 200 times in a single day from one address.
 *
 * Reporting that as demand invents a conversion problem where the real problem
 * is an absence of demand — and those two call for opposite work. So the
 * classification lives here rather than in a query, and every surface that
 * counts "agents" is expected to use it.
 *
 * Being probed is not worthless: it means the directories agents search have us
 * indexed. It is simply not the same event as a customer arriving, and must not
 * be counted as one.
 */

/**
 * Substrings that identify an automated monitor rather than a prospective user.
 * Matched case-insensitively against the user agent.
 *
 * Deliberately matched on the vocabulary of monitoring — probe, health, beat,
 * scanner, registry, observatory — rather than on a list of vendor names, so a
 * new checker is classified correctly on its first visit instead of after
 * someone notices it. The trade-off is that a genuine client naming itself
 * "…-probe" would be misfiled; that is the safer direction to be wrong in,
 * since it understates demand rather than inflating it.
 */
const PROBE_UA_PATTERNS = [
  "probe", "-health", "health/", "healthcheck", "mcpbeat", "heartbeat",
  "uptime", "monitor", "scanner", "scoringengine", "observatory",
  "registry-", "-registry", "reliability-", "bot/", "crawler", "spider",
];

/** True when the user agent identifies monitoring infrastructure. */
export function isProbeAgent(ua: string | null | undefined): boolean {
  if (!ua) return false; // absent UA is unknown, not proven-probe
  const u = ua.toLowerCase();
  return PROBE_UA_PATTERNS.some((p) => u.includes(p));
}

/**
 * SQL fragment for the same rule, for use in aggregate queries where pulling
 * every row into JS would be wasteful. Kept beside the list above so the two
 * cannot drift — if you add a pattern, it applies to both.
 */
export const PROBE_UA_SQL_PATTERNS = PROBE_UA_PATTERNS.map((p) => `%${p}%`);
