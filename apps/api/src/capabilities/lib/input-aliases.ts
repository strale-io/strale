import type { CapabilityInput } from "../index.js";

/**
 * Return the first key that holds a non-empty string, or "".
 *
 * Callers are overwhelmingly autonomous agents that guess field names, so every
 * executor accepts several aliases for the same value. That is normally written
 * as a chain of `(input.a as string) ?? (input.b as string) ?? ""`, which has
 * two problems:
 *
 *   1. `??` only falls through on null/undefined, so a key present but empty
 *      ("" or "   ") short-circuits the chain and the later aliases are never
 *      consulted.
 *   2. `as string` is an unchecked assertion. A caller passing a number gets
 *      `TypeError: x.trim is not a function` instead of a structured error.
 *
 * This checks the type and skips blanks, so `{company_name: "", name: "LEGO"}`
 * resolves to "LEGO" rather than "".
 *
 * NOTE: this is a local convenience, not the platform-level fix. The alias
 * fallback-chain shape appears in ~63 files under src/capabilities/; a proper
 * solution declares aliases in the manifest and normalises them before the
 * handler runs. Tracked separately — do not treat this helper as closing that.
 */
export function firstString(input: CapabilityInput, ...keys: string[]): string {
  for (const k of keys) {
    const v = (input as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}
