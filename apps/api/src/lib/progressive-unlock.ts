/**
 * Progressive unlock — after a successful free-tier call, related capabilities
 * become temporarily free for the same IP. In-memory store with 24h TTL.
 *
 * Same limitations as rate-limit.ts: per-instance, lost on restart. An agent
 * that loses its unlock just calls a free capability again to re-trigger.
 */

const UNLOCK_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const UNLOCK_MAP: Record<string, string[]> = {
  "url-to-markdown": ["meta-extract", "robots-txt-parse", "sitemap-parse"],
  "email-validate":  ["mx-lookup", "domain-reputation", "dns-lookup"],
  "dns-lookup":      ["whois-lookup", "ssl-check", "domain-reputation"],
  "iban-validate":   ["vat-format-validate", "swift-validate", "sepa-xml-validate"],
  "json-repair":     ["xml-to-json", "csv-to-json", "json-schema-validate"],
};

interface UnlockEntry {
  slugs: Set<string>;
  expiresAt: number;
}

const store = new Map<string, UnlockEntry>();

// Clean up expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}, 60_000).unref();

/**
 * Record an unlock triggered by a successful free-tier call.
 * Returns the list of newly unlocked slugs (empty if the trigger has no unlock map).
 */
export function recordUnlock(ipHash: string, triggerSlug: string): string[] {
  const toUnlock = UNLOCK_MAP[triggerSlug];
  if (!toUnlock || toUnlock.length === 0) return [];

  const now = Date.now();
  const existing = store.get(ipHash);

  if (existing && existing.expiresAt > now) {
    for (const slug of toUnlock) existing.slugs.add(slug);
    existing.expiresAt = now + UNLOCK_TTL_MS; // reset TTL on new activity
  } else {
    store.set(ipHash, {
      slugs: new Set(toUnlock),
      expiresAt: now + UNLOCK_TTL_MS,
    });
  }

  return toUnlock;
}

/**
 * Check if a capability is currently unlocked for the given IP hash.
 */
export function isUnlocked(ipHash: string, capabilitySlug: string): boolean {
  const entry = store.get(ipHash);
  if (!entry) return false;
  if (entry.expiresAt <= Date.now()) {
    store.delete(ipHash);
    return false;
  }
  return entry.slugs.has(capabilitySlug);
}

/**
 * Get all currently unlocked slugs for an IP (for response enrichment).
 */
export function getUnlockedSlugs(ipHash: string): string[] {
  const entry = store.get(ipHash);
  if (!entry) return [];
  if (entry.expiresAt <= Date.now()) {
    store.delete(ipHash);
    return [];
  }
  return [...entry.slugs];
}

/**
 * Get the unlock map entry for a trigger slug (for response enrichment).
 */
export function getUnlockMap(triggerSlug: string): string[] {
  return UNLOCK_MAP[triggerSlug] ?? [];
}
