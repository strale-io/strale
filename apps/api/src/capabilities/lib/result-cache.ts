/**
 * A small in-process TTL cache for expensive capability results.
 *
 * Why this exists (2026-08-25). The platform's first card-paying customer ran
 * the identical `competitor-compare` input four times and was charged €1.00
 * each time — €4.00 of the €5.09 they had spent in total. Each run cost us two
 * Browserless renders plus an LLM call and took 12–15 seconds. Nothing about
 * the second, third or fourth run was different work; they were repeats of a
 * question we had already answered.
 *
 * `vat-validate.ts` already had exactly this shape — a `Map`, a TTL, an
 * unref'd sweep, and a `cache_hit` field on the output — written inline for one
 * capability. This generalises that pattern rather than inventing a second one,
 * so the next expensive capability does not hand-roll a third.
 *
 * ## What this deliberately is not
 *
 * **It is not shared across instances.** The `Map` lives in one Node process,
 * so a Railway redeploy or a second instance starts cold. That is an accepted
 * limit, not an oversight: a shared cache means Redis, and the benefit here
 * (one buyer's repeated question inside a session) is overwhelmingly
 * same-instance. Revisit if a cross-instance hit rate ever justifies the
 * dependency.
 *
 * **It is not a freshness claim.** A cache hit returns the value AND the
 * timestamp it was originally computed at, so callers can report the real
 * `fetched_at` in provenance rather than the time of the cache hit. Reporting
 * "fetched now" for a value fetched yesterday is precisely the kind of
 * unsupported claim this codebase has had to retract from public copy before,
 * and the API is shaped so the honest version is the easy one — `get` cannot
 * return a value without also returning when it was computed.
 */

/** What a hit carries: the value, when it was computed, and how old it is. */
export interface CacheHit<T> {
  value: T;
  /** Epoch ms at which this value was originally computed — NOT the hit time. */
  cachedAt: number;
  ageMs: number;
}

export interface ResultCacheOptions {
  /** How long an entry stays servable, in ms. */
  ttlMs: number;
  /**
   * Hard cap on retained entries. When full, the oldest entry is evicted.
   * Bounded on purpose: entries here are whole capability outputs (~6KB for
   * competitor-compare), and an uncapped Map keyed on caller-supplied input is
   * a memory leak with a public endpoint in front of it.
   */
  maxEntries: number;
  /** Injectable clock. Tests drive TTL and eviction without sleeping. */
  now?: () => number;
}

export class ResultCache<T> {
  readonly #entries = new Map<string, { value: T; cachedAt: number }>();
  readonly #ttlMs: number;
  readonly #maxEntries: number;
  readonly #now: () => number;

  constructor(options: ResultCacheOptions) {
    this.#ttlMs = options.ttlMs;
    this.#maxEntries = options.maxEntries;
    this.#now = options.now ?? Date.now;
  }

  /**
   * A live entry, or null. Expired entries are deleted on read rather than
   * only on sweep, so an expired value can never be served even if the sweep
   * interval is not running (it does not run at all under tests, and a
   * `setInterval` that a test forgets to clear keeps a process alive).
   */
  get(key: string): CacheHit<T> | null {
    const entry = this.#entries.get(key);
    if (!entry) return null;

    const ageMs = this.#now() - entry.cachedAt;
    if (ageMs > this.#ttlMs) {
      this.#entries.delete(key);
      return null;
    }
    return { value: entry.value, cachedAt: entry.cachedAt, ageMs };
  }

  set(key: string, value: T): void {
    // Re-inserting an existing key must not leave the original insertion order
    // in place, or a hot key could be evicted while cold ones survive.
    this.#entries.delete(key);
    this.#entries.set(key, { value, cachedAt: this.#now() });

    while (this.#entries.size > this.#maxEntries) {
      // Map preserves insertion order, so the first key is the oldest write.
      const oldest = this.#entries.keys().next();
      if (oldest.done) break;
      this.#entries.delete(oldest.value);
    }
  }

  /** Drop every expired entry. Safe to call from an interval, or never. */
  sweep(): number {
    const now = this.#now();
    let removed = 0;
    for (const [key, entry] of this.#entries) {
      if (now - entry.cachedAt > this.#ttlMs) {
        this.#entries.delete(key);
        removed++;
      }
    }
    return removed;
  }

  get size(): number {
    return this.#entries.size;
  }

  /** Test seam. Never called in production paths. */
  clear(): void {
    this.#entries.clear();
  }
}
