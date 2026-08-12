/**
 * Re-export shim: the ToS blocklist moved to src/lib/tos-blocklist.ts
 * (P2, 2026-08-12) so the shared fetch layer (safe-fetch.ts, web-provider)
 * can enforce it without inverting layering — the same move
 * company-name-match made in PR #161. Executor imports stay stable.
 */
export * from "../../lib/tos-blocklist.js";
