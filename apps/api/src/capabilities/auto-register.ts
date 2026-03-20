/**
 * Auto-discovers and imports all capability executor files.
 * Replaces the manual import list that was previously in app.ts.
 *
 * Deactivated capabilities are tracked in DEACTIVATED with a reason,
 * so they are explicitly skipped (not silently ignored).
 */

import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const DEACTIVATED = new Map<string, string>([
  ["amazon-price", "Amazon CAPTCHA blocks datacenter IPs"],
  ["hong-kong-company-data", "No viable data source identified"],
  ["indian-company-data", "No viable data source identified"],
  ["singapore-company-data", "No viable data source identified"],
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
      console.log(
        `[auto-register] Skipping deactivated: ${slug} (${DEACTIVATED.get(slug)})`,
      );
      skipped++;
      continue;
    }
    try {
      await import(`./${slug}.js`);
      registered++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[auto-register] Failed to import ${slug}: ${msg}`);
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
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `[auto-register] Failed to import provider ${name}: ${msg}`,
        );
        errors++;
      }
    }
  } catch {
    // providers/ directory doesn't exist — that's fine
  }

  console.log(
    `[auto-register] Registered ${registered} executors + ${providerCount} providers, skipped ${skipped} deactivated, ${errors} errors`,
  );
}
