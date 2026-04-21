/**
 * Auto-discovers and imports all capability executor files.
 * Replaces the manual import list that was previously in app.ts.
 *
 * Deactivated capabilities are tracked in DEACTIVATED with a reason,
 * so they are explicitly skipped (not silently ignored).
 */

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { log, logError } from "../lib/log.js";

const DEACTIVATED = new Map<string, string>([
  ["amazon-price", "Amazon CAPTCHA blocks datacenter IPs"],
  ["hong-kong-company-data", "No viable data source identified"],
  ["indian-company-data", "No viable data source identified"],
  ["singapore-company-data", "No viable data source identified"],
  [
    "business-license-check-se",
    // DEC-20260421-SE-C: F-skatt/moms/employer flags have no free machine-readable source in 2026.
    // Skatteverket's F-skatt API is "under investigation" (no public API); Bolagsverket does not
    // expose tax-registration status. Previous runtime scraped allabolag.se, which surfaced
    // Skatteverket data via a KYB-competitor-owned aggregator — banned by DEC-20260420-H.
    // Reactivation trigger: Skatteverket ships a public F-skatt/moms/arbetsgivare lookup API,
    // OR a licensed commercial aggregator contract covers these fields.
    "No compliant source for F-skatt/moms/employer flags (see DEC-20260421-SE-C)",
  ],
]);

export function getDeactivatedCapabilities(): ReadonlyMap<string, string> {
  return DEACTIVATED;
}

export async function autoRegisterCapabilities(): Promise<void> {
  const dir = import.meta.dirname;

  // Phase 1: capability executors (top-level .ts/.js files excluding index, this file, and .d.ts declarations)
  const executorFiles = readdirSync(dir)
    .filter((f) => {
      if (!f.endsWith(".ts") && !f.endsWith(".js")) return false;
      if (f === "index.ts" || f === "index.js") return false;
      if (f === "auto-register.ts" || f === "auto-register.js") return false;
      // Exclude TypeScript declaration files (.d.ts in source, .d.js in compiled output)
      const nameWithoutExt = f.replace(/\.(ts|js)$/, "");
      if (nameWithoutExt.endsWith(".d")) return false;
      return true;
    })
    .sort();

  let registered = 0;
  let skipped = 0;
  let errors = 0;

  // Deduplicate: in compiled output both .js and .d.ts exist; locally only .ts
  const seen = new Set<string>();
  for (const file of executorFiles) {
    const slug = file.replace(/\.(ts|js)$/, "");
    if (seen.has(slug)) continue;
    seen.add(slug);
    if (DEACTIVATED.has(slug)) {
      log.info(
        { label: "auto-register-skip-deactivated", capability_slug: slug, reason: DEACTIVATED.get(slug) },
        "auto-register-skip-deactivated",
      );
      skipped++;
      continue;
    }
    try {
      await import(`./${slug}.js`);
      registered++;
    } catch (err) {
      logError("auto-register-import-failed", err, { capability_slug: slug });
      errors++;
    }
  }

  // Phase 2: DataProvider fallback chains (providers/ subdirectory)
  const providersDir = resolve(dir, "providers");
  let providerCount = 0;
  try {
    const providerFiles = readdirSync(providersDir)
      .filter((f) => {
        if (!f.endsWith(".ts") && !f.endsWith(".js")) return false;
        const nameWithoutExt = f.replace(/\.(ts|js)$/, "");
        if (nameWithoutExt.endsWith(".d")) return false;
        return true;
      })
      .sort();

    const seenProviders = new Set<string>();
    for (const file of providerFiles) {
      const name = file.replace(/\.(ts|js)$/, "");
      if (seenProviders.has(name)) continue;
      seenProviders.add(name);
      try {
        await import(`./providers/${name}.js`);
        providerCount++;
      } catch (err) {
        logError("auto-register-provider-import-failed", err, { provider: name });
        errors++;
      }
    }
  } catch {
    // providers/ directory doesn't exist — that's fine
  }

  log.info(
    {
      label: "auto-register-done",
      executors_registered: registered,
      providers_registered: providerCount,
      skipped_deactivated: skipped,
      errors,
    },
    "auto-register-done",
  );
}
