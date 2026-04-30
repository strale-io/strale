/**
 * GET /v1/platform/facts
 *
 * Public, unauthenticated, 5-min cached snapshot of every fact that
 * appears in marketing copy or other surfaces (frontend, llms.txt,
 * agent card, methodology pages, Terms/Privacy). Single source of
 * truth for those values.
 *
 * The frontend consumes this via the `usePlatformFacts` hook;
 * llms.txt and the agent card consume it server-side via
 * `computePlatformFacts()` directly. Marketing copy that wants any
 * of these values must read from this endpoint or be flagged by the
 * weekly `check-platform-facts-drift` cron.
 *
 * Why a separate endpoint and not just constants:
 *   - Live counts (capabilities, solutions, country coverage) move
 *     when the catalogue changes. Hardcoding them once was the bug.
 *   - The frontend repo deploys independently; pulling from API at
 *     runtime is the only way the homepage shows accurate counts
 *     within 5 min of a manifest change.
 *   - Cache key is process-local (no Redis); each Railway replica
 *     warms its own cache.
 */

import { Hono } from "hono";
import { computePlatformFacts, type PlatformFacts } from "../lib/platform-facts.js";
import { logError } from "../lib/log.js";

const CACHE_TTL_MS = 5 * 60 * 1000;

let _cached: PlatformFacts | null = null;
let _cachedAt = 0;
let _inFlight: Promise<PlatformFacts> | null = null;

async function getCached(): Promise<PlatformFacts> {
  const now = Date.now();
  if (_cached && now - _cachedAt < CACHE_TTL_MS) return _cached;

  // Coalesce concurrent refreshes — first-writer-wins; everyone else
  // awaits the same promise. Without this, a burst of cold-cache
  // requests issues N identical DB queries.
  if (_inFlight) return _inFlight;

  _inFlight = (async () => {
    try {
      const facts = await computePlatformFacts();
      _cached = facts;
      _cachedAt = Date.now();
      return facts;
    } finally {
      _inFlight = null;
    }
  })();

  return _inFlight;
}

export const platformFactsRoute = new Hono();

platformFactsRoute.get("/", async (c) => {
  try {
    const facts = await getCached();
    return c.json(facts, 200, {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    });
  } catch (err) {
    logError("platform-facts-compute-failed", err);
    // If we have a stale cache, prefer it to a 500. The whole point
    // is to keep marketing surfaces accurate; a momentary DB issue
    // shouldn't take llms.txt off the air.
    if (_cached) {
      return c.json(_cached, 200, {
        "Cache-Control": "public, max-age=60",
        "Access-Control-Allow-Origin": "*",
        "X-Strale-Stale": "true",
      });
    }
    return c.json({ error: "platform_facts_unavailable" }, 503);
  }
});

// Test-only — lets unit tests exercise the cache without 5-min waits.
export function _resetCacheForTests(): void {
  _cached = null;
  _cachedAt = 0;
  _inFlight = null;
}
